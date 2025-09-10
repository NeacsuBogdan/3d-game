"use client";

import ShowroomStage3D from "./ShowroomStage3D";
import type { StageMember } from "../_shared/types";

export default function StagePanel({
  members,
  currentUid,
  onClickMember,
}: {
  members: StageMember[];
  currentUid: string | null;
  onClickMember: (uid: string) => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden border">
      <ShowroomStage3D
        members={members}
        currentUid={currentUid}
        onClickMember={onClickMember}
      />
    </div>
  );
}
