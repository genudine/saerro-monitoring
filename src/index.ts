export interface Env {
  DISCORD_WEBHOOK_URL: string;
}

type UpDown = "UP" | "DOWN";

type HealthResponse = {
  data: {
    health: {
      ingest: UpDown;
      ingestReachable: UpDown;
      database: UpDown;
      worlds: {
        name: string;
        status: UpDown;
        lastEvent: string;
      }[];
    };
  };
};

const sendAlert = async (
  webhooks: string,
  health?: HealthResponse,
  downWorlds: HealthResponse["data"]["health"]["worlds"] = []
) => {
  const embed = {
    type: "rich",
    title: `Saerro Health Alert`,
    description: "",
    color: 0xff5858,
    fields: [
      {
        name: `General Failure`,
        value: `Saerro did not respond to health check.`,
      },
    ],
  };

  if (health) {
    const {
      health: { ingestReachable, database },
    } = health.data;

    let ingest: string = health.data.health.ingest;

    if (
      ingest === "UP" &&
      ingestReachable === "UP" &&
      database === "UP" &&
      downWorlds.length > 0
    ) {
      embed.color = 0xffd700;
      ingest = "DEGRADED - WORLDS DOWN (see https://saerro.ps2.live/ingest)";
    }

    embed.fields = [
      {
        name: `Ingest Reachability`,
        value: ingestReachable,
      },
      {
        name: `Ingest`,
        value: ingest,
      },
      {
        name: `Database`,
        value: database,
      },
      {
        name: `Down Worlds`,
        value: downWorlds.map((w) => w.name).join(", "),
      },
    ];
  }

  for (let hook of webhooks.split(",")) {
    await fetch(hook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });
  }
};

const checkWorldHealth = (
  worlds: HealthResponse["data"]["health"]["worlds"]
): HealthResponse["data"]["health"]["worlds"] => {
  return worlds
    .filter((w) => w.status === "DOWN")
    .filter((w) => {
      if (w.name === "jaeger") {
        // jaeger isn't important
        return false;
      }

      if (w.name === "genudine" || w.name === "ceres") {
        // wider tolerance for down reports on these playstation
        // allow for 1 hour of missing events
        let time = new Date(w.lastEvent);

        return time.getTime() < Date.now() - 1000 * 60 * 60;
      }

      return true;
    });
};

export default {
  // async fetch(_1: any, env: Env, ctx: any): Promise<Response> {
  //   try {
  //     await this.scheduled(_1, env, ctx);
  //   } catch (e) {
  //     return new Response("Failed to run scheduled: " + e);
  //   }
  //   return new Response("ok");
  // },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    try {
      const res = await fetch(
        "https://saerro.ps2.live/graphql?query={%20health%20{%20database%20ingest%20ingestReachable%20worlds%20{%20name%20status%20lastEvent%20}%20}%20}"
      );

      if (res.status !== 200) {
        throw new Error("Failed to fetch");
      }

      const json: HealthResponse = await res.json();

      const downWorlds = checkWorldHealth(json.data.health.worlds);

      if (
        json.data.health.ingest !== "UP" ||
        json.data.health.ingestReachable !== "UP" ||
        json.data.health.database !== "UP" ||
        downWorlds.length > 0
      ) {
        console.error("Sending alert, failed checks", json);
        await sendAlert(env.DISCORD_WEBHOOK_URL, json, downWorlds);
      }
    } catch (e) {
      console.error("Sending alert, no response", e);
      await sendAlert(env.DISCORD_WEBHOOK_URL, undefined, []);
    }
  },
};
