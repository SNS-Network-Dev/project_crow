import { readPoster } from "@/lib/posters";
import { decodeSelection } from "@/lib/gallery";
import { BASE_PATH } from "@/lib/basePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUBLIC download page a guest lands on after scanning the gallery QR on their
// phone (no operator cookie — /d is intentionally not a proxy.ts protected page).
// The token encodes the poster ids they picked; images come from the public
// /api/shot/[id]. Kept deliberately plain and mobile-first.
export default async function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ids = decodeSelection(token);

  // Keep only ids that still resolve to a stored poster.
  const present: string[] = [];
  for (const id of ids) {
    if (await readPoster(id)) present.push(id);
  }

  if (present.length === 0) {
    return (
      <main className="dl">
        <div className="dl-empty">
          <h1>Nothing to download</h1>
          <p>This link has expired or the photos are no longer available.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="dl">
      <header className="dl-head">
        <h1>Your event photos</h1>
        <p>Tap a photo to save it to your phone.</p>
      </header>
      <div className="dl-list">
        {present.map((id) => (
          <figure key={id} className="dl-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/api/shot/${id}`} alt="Event poster" />
            <a className="dl-save" href={`${BASE_PATH}/api/shot/${id}?dl=1`} download>
              Save this photo
            </a>
          </figure>
        ))}
      </div>
      <p className="dl-foot">On iPhone you can also long-press a photo and choose “Save to Photos”.</p>
    </main>
  );
}
