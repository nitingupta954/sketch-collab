"use client";

import { useEffect, useRef, useState } from "react";
import { WS_URl, HTTP_BACKEND } from "@/config";
import { Canvas } from "./Canvas";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function RoomCanvas({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Passcode gate state
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState("");
  const [passcodeLoading, setPasscodeLoading] = useState(false);

  // Hold a ref to the WS so we can re-use it after passcode is submitted
  const wsRef = useRef<WebSocket | null>(null);

  function connectAndJoin() {
    const token = localStorage.getItem("Authorization") || "";
    const ws = new WebSocket(`${WS_URl}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`🎉 Connected. Joining room: ${roomId}`);
      ws.send(JSON.stringify({ type: "join_room", roomId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // ✅ Server confirmed we're in — show the canvas
        if (data.type === "join_success") {
          setSocket(ws);
          return;
        }

        // 🔒 Server rejected: room needs a passcode and we're not a collaborator
        if (
          data.type === "error" &&
          typeof data.message === "string" &&
          data.message.toLowerCase().includes("passcode")
        ) {
          setNeedsPasscode(true);
          ws.close();
          return;
        }
      } catch {}
    };

    ws.onerror = (err) => console.error("❌ WebSocket Error:", err);

    return () => ws.close();
  }

  useEffect(() => {
    if (!roomId) return;
    return connectAndJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function handlePasscodeSubmit() {
    if (!passcode.trim()) {
      setPasscodeError("Please enter the passcode.");
      return;
    }
    setPasscodeLoading(true);
    setPasscodeError("");
    try {
      const token = localStorage.getItem("Authorization") || "";
      const res = await fetch(`${HTTP_BACKEND}/rooms/${roomId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ passcode }),
      });

      const body = await res.json();

      if (!res.ok) {
        setPasscodeError(body.message || "Invalid passcode. Try again.");
        return;
      }

      // Passcode accepted — close old socket and reconnect fresh as a collaborator
      wsRef.current?.close();
      setNeedsPasscode(false);
      setPasscode("");

      const ws = new WebSocket(`${WS_URl}?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join_room", roomId }));
        setSocket(ws);
      };
      ws.onerror = (err) => console.error("❌ WebSocket Error:", err);
    } catch {
      setPasscodeError("Something went wrong. Please try again.");
    } finally {
      setPasscodeLoading(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Passcode Gate Screen                                                */
  /* ------------------------------------------------------------------ */
  if (needsPasscode) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 via-white to-gray-200 dark:from-slate-900 dark:via-black dark:to-slate-950">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm mx-4 rounded-3xl bg-white shadow-2xl p-8 flex flex-col items-center gap-6"
          >
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Lock size={32} />
            </div>

            {/* Text */}
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Room is protected</h2>
              <p className="text-sm text-gray-500">Enter the passcode shared by the room owner to join.</p>
            </div>

            {/* Input */}
            <div className="w-full">
              <div className="relative">
                <input
                  type={showPasscode ? "text" : "password"}
                  placeholder="Enter passcode..."
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value.toUpperCase());
                    setPasscodeError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handlePasscodeSubmit()}
                  className={`w-full px-4 py-3 pr-12 rounded-xl border text-sm font-mono tracking-widest focus:outline-none focus:ring-2 transition-all
                    ${passcodeError
                      ? "border-red-300 focus:ring-red-200 bg-red-50"
                      : "border-gray-200 focus:ring-indigo-200"
                    }`}
                  autoFocus
                  maxLength={20}
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passcodeError && (
                <p className="mt-2 text-xs text-red-500 font-medium">{passcodeError}</p>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handlePasscodeSubmit}
              disabled={passcodeLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-60 shadow-md"
            >
              {passcodeLoading ? "Verifying..." : "Join Room"}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Connecting Screen                                                   */
  /* ------------------------------------------------------------------ */
  if (!socket) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 via-white to-gray-200 dark:from-slate-900 dark:via-black dark:to-slate-950">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-6 py-4 rounded-2xl backdrop-blur-xl bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-slate-700 shadow-xl text-gray-800 dark:text-gray-100"
        >
          Connecting to room...
        </motion.div>
      </div>
    );
  }

  return <Canvas roomId={roomId} socket={socket} />;
}
