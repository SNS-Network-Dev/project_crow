export default function Home() {
  return (
    <main className="wrap">
      <h1>Project Crow</h1>
      <p className="subtitle">Face-recognition check-in &amp; event avatar posters.</p>

      <div className="panel">
        <p>
          Use the sidebar to <strong>check in</strong> a guest, generate an <strong>avatar
          poster</strong>, <strong>register</strong> a new person, or open the <strong>admin</strong>{" "}
          dashboard.
        </p>
        <p className="muted" style={{ marginTop: 12 }}>
          Camera access needs HTTPS or localhost. Over plain http://&lt;lan-ip&gt; the browser
          silently blocks the camera — use the upload fallback on those pages.
        </p>
      </div>
    </main>
  );
}