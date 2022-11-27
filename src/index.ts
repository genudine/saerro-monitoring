export interface Env {
  DISCORD_WEBHOOK_URL: string;
}

type WebsocketStatus = "PRIMARY" | "BACKUP" | "DOWN";
type RedisStatus = "UP" | "DOWN";

type HealthResponse = {
  data: {
    health: {
      redis: RedisStatus;
      pc: WebsocketStatus;
      ps4us: WebsocketStatus;
      ps4eu: WebsocketStatus;
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
      health: { redis, pc, ps4us, ps4eu },
    } = health.data;

    embed.fields = [
      { name: "Redis", value: redis },
      { name: "PC", value: pc },
      { name: "PS4 US", value: ps4us },
      { name: "PS4 EU", value: ps4eu },
    ];

    if (
      pc !== "DOWN" &&
      ps4us !== "DOWN" &&
      ps4eu !== "DOWN" &&
      redis !== "DOWN"
    ) {
      embed.color = 0xffd700;
    }
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
        "https://saerro.harasse.rs/graphql?query=%7B%20health%20%7B%20pc%20redis%20ps4us%20ps4eu%20%7D%7D"
      );

      if (res.status !== 200) {
        throw new Error("Failed to fetch");
      }

      const json: HealthResponse = await res.json();

      if (
        json.data.health.redis !== "UP" ||
        json.data.health.pc !== "PRIMARY" ||
        json.data.health.ps4us !== "PRIMARY" ||
        json.data.health.ps4eu !== "PRIMARY"
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
