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
    };
  };
};

const sendAlert = (webhook: string, health?: HealthResponse) => {
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
      health: { ingest, ingestReachable, database },
    } = health.data;

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
    ];
  }

  return fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [embed],
    }),
  });
};

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    try {
      const res = await fetch(
        "https://saerro.ps2.live/graphql?query=%7B%20health%20%7B%20ingest%20ingestReachable%20database%7D%7D"
      );

      if (res.status !== 200) {
        throw new Error("Failed to fetch");
      }

      const json: HealthResponse = await res.json();

      if (
        json.data.health.ingest !== "UP" ||
        json.data.health.ingestReachable !== "UP" ||
        json.data.health.database !== "UP"
      ) {
        console.error("Sending alert, failed checks", json);
        await sendAlert(env.DISCORD_WEBHOOK_URL, json);
      }
    } catch (e) {
      console.error("Sending alert, no response", e);
      await sendAlert(env.DISCORD_WEBHOOK_URL);
    }
  },
};
