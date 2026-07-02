import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap">
      <h1>Project Crow</h1>
      <p className="subtitle">Face-recognition check-in</p>

      <div className="grid-links">
        <Link href="/checkin" className="card-link">
          <h2>📷 Check in</h2>
          <p>Auto-capture face check-in. Works full-screen on a phone or an iPad kiosk.</p>
        </Link>
        <Link href="/avatar" className="card-link">
          <h2>🎟️ Avatar poster</h2>
          <p>Full-body photo → a collectible figure of you on the event poster.</p>
        </Link>
        <Link href="/register" className="card-link">
          <h2>➕ Register</h2>
          <p>Enroll a new person with a clear, solo, front-facing photo.</p>
        </Link>
        <Link href="/admin" className="card-link">
          <h2>📋 Admin</h2>
          <p>Recent check-ins and enrolled people management.</p>
        </Link>
      </div>

      <p className="subtitle" style={{ marginTop: 28 }}>
        Camera access needs HTTPS or localhost. Over plain http://&lt;lan-ip&gt; the browser
        silently blocks the camera.
      </p>
    </main>
  );
}
