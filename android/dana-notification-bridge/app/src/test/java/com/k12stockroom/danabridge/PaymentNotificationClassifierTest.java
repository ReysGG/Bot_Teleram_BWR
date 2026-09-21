package com.k12stockroom.danabridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class PaymentNotificationClassifierTest {
    @Test
    public void classifiesTrustedProviderPackages() {
        assertEquals(
            PaymentNotificationClassifier.Provider.DANA,
            PaymentNotificationClassifier.providerForPackage("id.dana")
        );
        assertEquals(
            PaymentNotificationClassifier.Provider.DANA,
            PaymentNotificationClassifier.providerForPackage("id.dana.kasir")
        );
        assertEquals(
            PaymentNotificationClassifier.Provider.JAGO,
            PaymentNotificationClassifier.providerForPackage("com.jago.digitalBanking")
        );
        assertEquals(
            PaymentNotificationClassifier.Provider.SHOPEE_PARTNER,
            PaymentNotificationClassifier.providerForPackage("com.shopeepay.merchant.id")
        );
        assertNull(PaymentNotificationClassifier.providerForPackage("com.example.fake"));
    }

    @Test
    public void acceptsIncomingBankJagoTransfer() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Jago",
                "MUHAMMAD RIZKI YANTO telah mengirim Rp25.000 ke kamu. Buka aplikasi Jago untuk melihat detailnya."
            );

        assertEquals(PaymentNotificationClassifier.Action.FORWARD, result.action);
        assertEquals(PaymentNotificationClassifier.Provider.JAGO, result.provider);
    }

    @Test
    public void acceptsIncomingBankJagoReceiptFromSender() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Jago",
                "Kamu menerima kiriman Rp35.098 dari SHADIQ HAIRWIZ"
            );

        assertEquals(PaymentNotificationClassifier.Action.FORWARD, result.action);
        assertEquals(PaymentNotificationClassifier.Provider.JAGO, result.provider);
    }

    @Test
    public void acceptsIncomingBankJagoReceiptFromGoPay() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Jago",
                "Kamu menerima Rp10.565 dari GoPay"
            );

        assertEquals(PaymentNotificationClassifier.Action.FORWARD, result.action);
        assertEquals(PaymentNotificationClassifier.Provider.JAGO, result.provider);
    }

    @Test
    public void rejectsOutgoingBankJagoTransfer() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Jago",
                "Kamu telah mengirim Rp25.000 ke MUHAMMAD RIZKI YANTO. Transfer berhasil."
            );

        assertEquals(PaymentNotificationClassifier.Action.IGNORE, result.action);
    }

    @Test
    public void rejectsOutgoingBankJagoPayment() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Jago",
                "Kamu telah membayar Rp22.000 ke TOKO CONTOH"
            );

        assertEquals(PaymentNotificationClassifier.Action.IGNORE, result.action);
    }

    @Test
    public void rejectsBankJagoRefundAndPromoNoise() {
        assertEquals(
            PaymentNotificationClassifier.Action.IGNORE,
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Jago",
                "Pengembalian dana Rp25.000 telah masuk ke Kantong Utama."
            ).action
        );
        assertEquals(
            PaymentNotificationClassifier.Action.IGNORE,
            PaymentNotificationClassifier.classify(
                "com.jago.digitalBanking",
                "Promo Jago",
                "Dapatkan cashback Rp25.000 hari ini."
            ).action
        );
    }

    @Test
    public void preservesExistingDanaForwardingBehavior() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "id.dana",
                "Promo DANA",
                "Voucher dan cashback Rp25.000"
            );

        assertEquals(PaymentNotificationClassifier.Action.FORWARD, result.action);
        assertEquals(PaymentNotificationClassifier.Provider.DANA, result.provider);
    }

    @Test
    public void acceptsExactShopeePartnerIncomingPayment() {
        String packageName = "com.shopeepay.merchant.id";
        String title = "Pembayaran sebesar Rp3.500";
        String body = "Pembayaran sebesar Rp3.500 telah diterima pada transaksi 120009123456.";

        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(packageName, title, body);

        assertEquals(PaymentNotificationClassifier.Action.FORWARD, result.action);
        assertEquals(PaymentNotificationClassifier.Provider.SHOPEE_PARTNER, result.provider);
        assertTrue(PaymentNotificationClassifier.looksLikePayment(packageName, title, body));
    }

    @Test
    public void ignoresShopeePartnerGroupSummary() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.shopeepay.merchant.id",
                "2 pembayaran baru",
                "Pembayaran sebesar Rp3.500 telah diterima pada transaksi 120009123456.",
                true
            );

        assertEquals(PaymentNotificationClassifier.Action.IGNORE, result.action);
        assertEquals(PaymentNotificationClassifier.Provider.SHOPEE_PARTNER, result.provider);
    }

    @Test
    public void ignoresOtherShopeePartnerNotifications() {
        assertEquals(
            PaymentNotificationClassifier.Action.IGNORE,
            PaymentNotificationClassifier.classify(
                "com.shopeepay.merchant.id",
                "Pembayaran berhasil",
                "Pembayaran sebesar Rp3.500 sedang diproses pada transaksi 120009123456."
            ).action
        );
        assertEquals(
            PaymentNotificationClassifier.Action.IGNORE,
            PaymentNotificationClassifier.classify(
                "com.shopeepay.merchant.id",
                "Ringkasan transaksi",
                "Hari ini kamu menerima 3 pembayaran."
            ).action
        );
        assertEquals(
            PaymentNotificationClassifier.Action.IGNORE,
            PaymentNotificationClassifier.classify(
                "com.shopeepay.merchant.id",
                "Pembayaran masuk",
                "Pembayaran sebesar Rp3.500 telah diterima."
            ).action
        );
    }

    @Test
    public void keepsShopeeWordingUntrustedForOtherPackages() {
        PaymentNotificationClassifier.Classification result =
            PaymentNotificationClassifier.classify(
                "com.example.fake",
                "Pembayaran sebesar Rp3.500",
                "Pembayaran sebesar Rp3.500 telah diterima pada transaksi 120009123456."
            );

        assertEquals(PaymentNotificationClassifier.Action.UNTRUSTED, result.action);
        assertNull(result.provider);
    }
}
