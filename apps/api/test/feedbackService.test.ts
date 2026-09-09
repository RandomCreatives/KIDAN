import { describe, expect, it, vi } from "vitest";
import { FeedbackService, FeedbackError } from "../src/feedback/feedbackService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import type { AdminNotification } from "../src/notifications/adminNotifier.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("feedback service", () => {
  it("persists feedback and lists newest-first with unread count", async () => {
    const repo = new MemoryPersistenceRepository();
    const svc = new FeedbackService(repo);
    await svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "feedback", body: "First", now: new Date("2026-08-01T00:00:00Z") });
    await svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "report", body: "Second", now: new Date("2026-08-02T00:00:00Z") });

    const list = await svc.list();
    expect(list.items).toHaveLength(2);
    expect(list.items[0]!.body).toBe("Second");
    expect(list.unreadCount).toBe(2);
  });

  it("marks an entry read", async () => {
    const repo = new MemoryPersistenceRepository();
    const svc = new FeedbackService(repo);
    const created = await svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "comment", body: "Hi" });
    expect(await svc.list().then((l) => l.unreadCount)).toBe(1);
    expect(await svc.markRead(created.id)).toBe(true);
    expect(await svc.list().then((l) => l.unreadCount)).toBe(0);
    expect(await svc.markRead("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("rejects empty and too-long bodies", async () => {
    const repo = new MemoryPersistenceRepository();
    const svc = new FeedbackService(repo);
    await expect(svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "feedback", body: "   " })).rejects.toBeInstanceOf(FeedbackError);
    await expect(svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "feedback", body: "x".repeat(4001) })).rejects.toBeInstanceOf(FeedbackError);
  });

  it("exposes the caller's public code", async () => {
    const repo = new MemoryPersistenceRepository();
    const svc = new FeedbackService(repo);
    expect(await svc.publicCodeFor(USER_ID)).toBeNull();
  });

  it("pings the operator for a report but not for feedback/comment", async () => {
    const repo = new MemoryPersistenceRepository();
    const notify = vi.fn().mockResolvedValue(undefined);
    const svc = new FeedbackService(repo, { notify } as never);

    await svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "report", body: "Something is wrong." });
    expect(notify).toHaveBeenCalledTimes(1);
    const payload = notify.mock.calls[0]![0] as AdminNotification;
    expect(payload.kind).toBe("new_feedback");
    expect(payload.message).toContain("KD-AAAAAA");
    expect(payload.message).not.toMatch(/name|phone|@/i);

    await svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "feedback", body: "Nice app." });
    await svc.submit({ userId: USER_ID, publicCode: "KD-AAAAAA", kind: "comment", body: "A question." });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
