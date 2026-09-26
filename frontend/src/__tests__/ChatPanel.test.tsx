import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/ChatPanel";
import type { ChatHistoryItem, ChatResponse } from "@/lib/types";
import { media } from "../../vitest.setup";

const noHistory = () => Promise.resolve([]);

const reply: ChatResponse = {
  message: "Done. Bought NVDA and added PYPL.",
  trades: [{ id: "t1", ticker: "NVDA", side: "buy", quantity: 5, price: 800, executed_at: "" }],
  watchlist_changes: [{ ticker: "PYPL", action: "add" }],
  errors: [],
};

describe("ChatPanel", () => {
  it("shows a loading indicator until the reply arrives, then renders actions inline", async () => {
    let resolve!: (r: ChatResponse) => void;
    const onSend = vi.fn(() => new Promise<ChatResponse>((r) => (resolve = r)));
    render(<ChatPanel onSend={onSend} loadHistory={noHistory} />);

    await userEvent.type(screen.getByTestId("chat-input"), "buy 5 NVDA");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(onSend).toHaveBeenCalledWith("buy 5 NVDA");
    expect(screen.getByTestId("chat-message")).toHaveAttribute("data-role", "user");
    expect(screen.getByTestId("chat-message")).toHaveTextContent("buy 5 NVDA");
    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();
    expect(screen.getByTestId("chat-send")).toBeDisabled();

    resolve(reply);
    await waitFor(() => expect(screen.getAllByTestId("chat-message")).toHaveLength(2));
    const assistant = screen.getAllByTestId("chat-message")[1];
    expect(assistant).toHaveAttribute("data-role", "assistant");
    expect(assistant).toHaveTextContent("Done.");
    expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument();
    const [trade, change] = screen.getAllByTestId("chat-action");
    expect(trade).toHaveTextContent("Bought 5 NVDA at 800.00");
    expect(change).toHaveTextContent("Watching PYPL");
  });

  it("shows an error message when the request fails", async () => {
    render(<ChatPanel onSend={vi.fn().mockRejectedValue(new Error("Request failed (500)"))} loadHistory={noHistory} />);
    await userEvent.type(screen.getByTestId("chat-input"), "hi{Enter}");
    await waitFor(() => expect(screen.getAllByTestId("chat-message")).toHaveLength(2));
    expect(screen.getAllByTestId("chat-message")[1]).toHaveTextContent("Request failed (500)");
  });

  it("collapses and expands", async () => {
    render(<ChatPanel onSend={vi.fn()} loadHistory={noHistory} />);
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("restores history with inline actions on mount", async () => {
    const history: ChatHistoryItem[] = [
      { id: "1", role: "user", content: "buy 1 NVDA", actions: null, created_at: "" },
      { id: "2", role: "assistant", content: "Bought it.", actions: { trades: reply.trades, watchlist_changes: [], errors: [] }, created_at: "" },
    ];
    render(<ChatPanel onSend={vi.fn()} loadHistory={() => Promise.resolve(history)} />);
    await waitFor(() => expect(screen.getAllByTestId("chat-message")).toHaveLength(2));
    expect(screen.getAllByTestId("chat-message")[1]).toHaveAttribute("data-role", "assistant");
    expect(screen.getByTestId("chat-action")).toHaveTextContent("Bought 5 NVDA");
  });

  it("starts collapsed on narrow screens", () => {
    media.matches = true;
    render(<ChatPanel onSend={vi.fn()} loadHistory={noHistory} />);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-toggle")).toBeInTheDocument();
  });
});
