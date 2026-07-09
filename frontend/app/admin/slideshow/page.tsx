import Slideshow from "../../components/Slideshow";

// Bare full-screen slideshow of the photo-booth posters (no sidebar — see
// AppShell). Operator-gated by proxy.ts like the other /admin surfaces.
export default function SlideshowPage() {
  return <Slideshow />;
}
