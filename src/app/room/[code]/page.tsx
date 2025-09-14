﻿import LobbyPage from "./LobbyPage";

export default async function RoomPage({
  params,
}: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LobbyPage code={code.toUpperCase()} />;
}
