import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { GameShell } from "@/components/GameShell";

interface PlayPageProps {
  params: Promise<{ gameId: string }>;
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { gameId } = await params;
  const game = getGame(gameId);

  if (!game) {
    notFound();
  }

  return <GameShell game={game} />;
}
