import Link from "next/link";

const CARDS = [
  {
    href: "/admin/list",
    title: "List",
    description: "Registered guests, check-ins, and no-shows.",
  },
  {
    href: "/admin/settings",
    title: "Settings",
    description: "Event name, start time, and early check-in countdown.",
  },
  {
    href: "/admin/checkin",
    title: "Check in",
    description: "Open the face check-in kiosk.",
  },
  {
    href: "/admin/avatar",
    title: "Photo booth",
    description: "Open the AI photo booth.",
  },
  {
    href: "/admin/avatar/gallery",
    title: "Photo gallery",
    description: "Browse and download generated photos.",
  },
];

export default function AdminPage() {
  return (
    <main className="wrap wrap--wide">
      <h1 style={{ marginBottom: 6 }}>Admin</h1>
      <p className="subtitle" style={{ marginBottom: 24 }}>
        Manage the event from one place.
      </p>

      <div className="grid-links">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="card-link">
            <h2>{c.title}</h2>
            <p>{c.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
