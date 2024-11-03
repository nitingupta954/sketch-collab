import { NextRequest, NextResponse } from "next/server";
import { prismaClient } from "@repo/db/client";
import { authenticate } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = authenticate(req);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized: No userId found" }, { status: 403 });
    }

    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: { 
        rooms: {
          include: {
            admin: true,
            collaborators: { include: { user: true } }
          }
        },
        collaborators: {
          include: {
            room: {
              include: {
                admin: true,
                collaborators: { include: { user: true } }
              }
            }
          }
        }
      },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Strip password from any user object before sending to client
    const sanitizeUser = (u: any) => {
      if (!u) return u;
      const { password, ...safe } = u;
      return safe;
    };

    const sanitizeRoom = (room: any) => ({
      ...room,
      admin: sanitizeUser(room.admin),
      collaborators: (room.collaborators || []).map((c: any) => ({
        ...c,
        user: sanitizeUser(c.user),
      })),
    });

    const { password, ...userWithoutPassword } = user;

    const allRooms = [
      ...user.rooms,
      ...user.collaborators.map((c: any) => c.room)
    ];
    const uniqueRooms = Array.from(new Map(allRooms.map((r: any) => [r.id, r])).values())
      .map(sanitizeRoom);

    return NextResponse.json({ user: userWithoutPassword, rooms: uniqueRooms });
  } catch (error: any) {
    console.error("Error fetching user details:", error);
    return NextResponse.json({ message: "Internal server error", error: error.message }, { status: 500 });
  }
}
