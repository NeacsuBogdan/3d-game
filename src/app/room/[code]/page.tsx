import Protected from '@/components/Protected';
import Lobby from './Lobby';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <Protected>
      <Lobby code={code.toUpperCase()} />
    </Protected>
  );
}
