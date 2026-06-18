import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
} from "arcade";

function Surface({ children }) {
  return (
    <div
      className="dark"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        padding: "2rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "1.5rem",
        alignItems: "flex-start",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

export function GameCard() {
  return (
    <Surface>
      <Card style={{ width: 320 }}>
        <CardHeader>
          <CardTitle>Neon Drop</CardTitle>
          <CardDescription>
            Survive the falling blocks — top score takes the pot.
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon-sm">
              ★
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Best 12,480 · 38 playing now
          </div>
        </CardContent>
        <CardFooter>
          <Button>Play · 5 🧅</Button>
        </CardFooter>
      </Card>
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface>
      <Card size="sm" style={{ width: 260 }}>
        <CardHeader>
          <CardTitle>Daily streak</CardTitle>
          <CardDescription>3 days — keep it going</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            style={{
              color: "var(--neon-primary)",
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            +120
          </div>
        </CardContent>
      </Card>
    </Surface>
  );
}
