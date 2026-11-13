import { adapters, platformOrder } from "@/platforms";
import { ComposeForm, type PlatformOption } from "./compose-form";

export default function ComposePage() {
  const platforms: PlatformOption[] = platformOrder.map((id) => {
    const a = adapters[id];
    return { id, name: a.name, mode: a.mode, video: a.supports.video, text: a.supports.text, description: a.description };
  });
  return (
    <>
      <h1>New post</h1>
      <p className="sub">Upload once, publish everywhere.</p>
      <ComposeForm platforms={platforms} />
    </>
  );
}
