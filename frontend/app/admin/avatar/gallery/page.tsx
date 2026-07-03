import AvatarGallery from "../../../components/AvatarGallery";

// Operator-gated pickup station (under the protected /admin/avatar prefix).
// Renders bare (no sidebar) like the other tool surfaces; operators reach it
// from the sidebar.
export default function AvatarGalleryPage() {
  return <AvatarGallery />;
}
