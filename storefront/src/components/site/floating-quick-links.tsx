import { Icon } from "@/components/ui/icon";

export function FloatingQuickLinks() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "K12JsonStockBot";
  return (
    <nav className="floating-quick-links" aria-label="Akses cepat">
      <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer" aria-label="Buka bot Telegram">
        <Icon name="send" size={18} aria-hidden="true" />
        <span>Bot Telegram</span>
      </a>
      <a href="https://t.me/davidboysaja" target="_blank" rel="noopener noreferrer" aria-label="Chat admin di Telegram">
        <Icon name="send" size={18} aria-hidden="true" />
        <span>Chat admin</span>
      </a>
    </nav>
  );
}
