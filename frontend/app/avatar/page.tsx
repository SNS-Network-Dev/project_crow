import Link from "next/link";
import AvatarStudio from "../components/AvatarStudio";

export default function AvatarPage() {
  return (
    <main className="wrap">
      <h1>Your event avatar</h1>
      <p className="subtitle">
        Take a full-body photo and we&apos;ll turn you into a collectible figure on the event
        poster.
      </p>
      <AvatarStudio />
      <p className="subtitle" style={{ marginTop: 18 }}>
        <Link href="/">← Home</Link>
      </p>
    </main>
  );
}
