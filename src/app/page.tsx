import { isLocalAuthBypassEnabled } from "@/lib/local-auth-bypass";
import HomeClient from "./HomeClient";

export default function HomePage() {
  const devBypassSession = isLocalAuthBypassEnabled();

  return <HomeClient devBypassSession={devBypassSession} />;
}
