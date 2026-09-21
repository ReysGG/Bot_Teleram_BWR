package com.k12stockroom.danabridge;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Identifies trusted payment providers before an event enters the durable queue. */
final class PaymentNotificationClassifier {
    static final String JAGO_PACKAGE = "com.jago.digitalBanking";
    static final String SHOPEE_PARTNER_PACKAGE = "com.shopeepay.merchant.id";

    enum Provider {
        DANA("DANA"),
        JAGO("Bank Jago"),
        SHOPEE_PARTNER("Shopee Partner");

        private final String displayName;

        Provider(String displayName) {
            this.displayName = displayName;
        }

        String displayName() {
            return displayName;
        }
    }

    enum Action {
        FORWARD,
        IGNORE,
        UNTRUSTED
    }

    static final class Classification {
        final Action action;
        final Provider provider;
        final String reason;

        Classification(Action action, Provider provider, String reason) {
            this.action = action;
            this.provider = provider;
            this.reason = reason;
        }
    }

    private static final Pattern JAGO_INCOMING_TRANSFER = Pattern.compile(
        "\\btelah\\s+mengirim(?:kan)?\\s+rp\\.?\\s*[0-9][0-9.,]*\\s+ke\\s+kamu\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern JAGO_INCOMING_RECEIPT = Pattern.compile(
        "\\bkamu\\s+menerima(?:\\s+kiriman)?\\s+rp\\.?\\s*[0-9][0-9.,]*\\s+dari\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern SHOPEE_PARTNER_INCOMING_RECEIPT = Pattern.compile(
        "\\bpembayaran\\s+sebesar\\s+rp\\.?\\s*[0-9](?:[0-9.,]*[0-9])?" +
            "\\s+telah\\s+diterima\\s+pada\\s+transaksi\\s+[a-z0-9][a-z0-9-]*\\b",
        Pattern.CASE_INSENSITIVE
    );

    private static final List<String> JAGO_EXCLUDED_PHRASES = List.of(
        "cashback",
        "voucher",
        "promo",
        "promosi",
        "hadiah",
        "bonus",
        "diskon",
        "reward",
        "poin",
        "kupon",
        "refund",
        "pengembalian",
        "reversal",
        "dibatalkan",
        "pembatalan",
        "kamu telah mengirim",
        "kamu berhasil mengirim",
        "transfer berhasil",
        "berhasil transfer",
        "telah kamu kirim",
        "telah dikirim"
    );

    private PaymentNotificationClassifier() {}

    static Classification classify(String packageName, String title, String body) {
        return classify(packageName, title, body, false);
    }

    static Classification classify(
        String packageName,
        String title,
        String body,
        boolean isGroupSummary
    ) {
        Provider provider = providerForPackage(packageName);
        if (provider == null) {
            return new Classification(Action.UNTRUSTED, null, "package belum diizinkan");
        }

        // DANA keeps its proven behavior: trusted package events are classified by the server.
        if (provider == Provider.DANA) {
            return new Classification(Action.FORWARD, provider, "package DANA tepercaya");
        }

        String content = normalize(title + "\n" + body);
        if (provider == Provider.SHOPEE_PARTNER) {
            if (isGroupSummary) {
                return new Classification(Action.IGNORE, provider, "ringkasan grup notifikasi");
            }
            if (!SHOPEE_PARTNER_INCOMING_RECEIPT.matcher(content).find()) {
                return new Classification(Action.IGNORE, provider, "bukan pembayaran masuk Shopee Partner");
            }
            return new Classification(Action.FORWARD, provider, "pembayaran masuk Shopee Partner");
        }

        for (String phrase : JAGO_EXCLUDED_PHRASES) {
            if (content.contains(phrase)) {
                return new Classification(Action.IGNORE, provider, "konten keluar, refund, atau promo");
            }
        }
        if (!JAGO_INCOMING_TRANSFER.matcher(content).find()
            && !JAGO_INCOMING_RECEIPT.matcher(content).find()) {
            return new Classification(Action.IGNORE, provider, "bukan transfer masuk Bank Jago");
        }
        return new Classification(Action.FORWARD, provider, "transfer masuk Bank Jago");
    }

    static Provider providerForPackage(String packageName) {
        if ("id.dana".equals(packageName) || "id.dana.kasir".equals(packageName)) {
            return Provider.DANA;
        }
        if (JAGO_PACKAGE.equals(packageName)) return Provider.JAGO;
        if (SHOPEE_PARTNER_PACKAGE.equals(packageName)) return Provider.SHOPEE_PARTNER;
        return null;
    }

    static boolean looksLikePayment(String packageName, String title, String body) {
        String content = normalize(packageName + "\n" + title + "\n" + body);
        return content.contains("dana")
            || content.contains("jago")
            || content.contains("shopee partner")
            || content.contains("pembayaran masuk")
            || content.contains("pembayaran diterima")
            || SHOPEE_PARTNER_INCOMING_RECEIPT.matcher(content).find()
            || content.contains("uang masuk")
            || content.contains("telah mengirim")
            || content.contains("ke kamu");
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }
}
