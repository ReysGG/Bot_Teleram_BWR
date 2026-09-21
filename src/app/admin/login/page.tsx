const errorMessages: Record<string, string> = {
  invalid: "Email atau password tidak cocok.",
  rate: "Terlalu banyak percobaan. Coba lagi beberapa menit.",
  config: "Konfigurasi admin belum lengkap.",
  origin: "Sesi login tidak valid. Muat ulang halaman lalu coba lagi.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Restricted stockroom</p>
        <h1>Masuk sebagai admin</h1>
        <p className="muted">Credential hanya dapat dilihat setelah autentikasi admin.</p>
        {error ? <p className="alert alert-error">{errorMessages[error] ?? "Login gagal."}</p> : null}
        <form action="/api/admin/login" method="post" className="stack-form">
          <label>
            Email admin
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button className="button button-primary" type="submit">
            Masuk ke stockroom
          </button>
        </form>
      </section>
    </main>
  );
}
