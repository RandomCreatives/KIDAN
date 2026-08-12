import { Bot, InlineKeyboard } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL;

if (!token || !miniAppUrl) {
  console.error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required to start the bot.");
  process.exit(1);
}

const bot = new Bot(token);

bot.command("start", async (context) => {
  const keyboard = new InlineKeyboard().webApp("Open Kidan", miniAppUrl);
  await context.reply(
    "Welcome to Kidan — private, intentional Orthodox Christian introductions. Your identity and profile details are never placed in bot messages.",
    { reply_markup: keyboard, protect_content: true },
  );
});

bot.command("privacy", async (context) => {
  await context.reply(
    "Kidan notifications are generic. Names, phone numbers, profile details, and connection identities are shown only inside the secured app when authorized.",
    { protect_content: true },
  );
});

bot.catch((error) => {
  // Never log update payloads; they may contain user attributes or messages.
  console.error("Bot update failed", { error: error.error instanceof Error ? error.error.message : "unknown" });
});

await bot.start({ onStart: () => console.info("Kidan bot started") });
