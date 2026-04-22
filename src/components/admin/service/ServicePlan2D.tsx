'use client';

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { ServiceTableCard } from './ServiceTableCard';
import type { PlanPosition, PlanPositions } from './use-plan-positions';
import type { ServiceServerVM, ServiceTableVM } from './service.types';

interface Props {
  zoneName: string;
  tables: ServiceTableVM[];
  selectedId: string | null;
  dragOverId: string | null;
  serverById: Map<string, ServiceServerVM>;
  editMode: boolean;
  positions: PlanPositions;
  onPositionChange: (tableId: string, position: PlanPosition) => void;
  labels: {
    free: string;
    occupied: string;
    reserved: string;
    cleaning: string;
    seatsShort: string;
    emptyServerDropHint: string;
    emptyServerCleaningHint: string;
    emptyServerReserved: string;
    sinceSince: string;
    releaseAria: string;
    roomPlanLabel: string;
    editModeHint: string;
  };
  onSelect: (tableId: string) => void;
  onRelease: (assignmentId: string) => void;
  onDragOver: (tableId: string) => void;
  onDragLeave: (tableId: string) => void;
  onDrop: (tableId: string, serverId: string) => void;
}

const COLS = 4;
const CELL_W = 180;
const CELL_H = 140;
const PAD_X = 40;
const PAD_Y = 40;
const CARD_W = 148;
const CARD_H = 96;
const DRAG_THRESHOLD = 4;

function defaultPosition(index: number): PlanPosition {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: PAD_X + col * CELL_W, y: PAD_Y + 20 + row * CELL_H };
}

export function ServicePlan2D({
  zoneName,
  tables,
  selectedId,
  dragOverId,
  serverById,
  editMode,
  positions,
  onPositionChange,
  labels,
  onSelect,
  onRelease,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const planRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    tableId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [livePosition, setLivePosition] = useState<{
    tableId: string;
    x: number;
    y: number;
  } | null>(null);

  const rows = Math.max(1, Math.ceil(tables.length / COLS));
  const planHeight = PAD_Y * 2 + rows * CELL_H + 20;

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, tableId: string, origin: PlanPosition) => {
      if (!editMode) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragStateRef.current = {
        tableId,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: origin.x,
        originY: origin.y,
        moved: false,
      };
    },
    [editMode],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (!state.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      state.moved = true;
      const planEl = planRef.current;
      const planWidth = planEl?.clientWidth ?? PAD_X * 2 + COLS * CELL_W;
      const maxX = Math.max(0, planWidth - CARD_W - 4);
      const maxY = Math.max(0, planHeight - CARD_H - 4);
      const nextX = Math.min(maxX, Math.max(4, state.originX + dx));
      const nextY = Math.min(maxY, Math.max(4, state.originY + dy));
      setLivePosition({ tableId: state.tableId, x: nextX, y: nextY });
    },
    [planHeight],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (state.moved && livePosition) {
        onPositionChange(state.tableId, { x: livePosition.x, y: livePosition.y });
      }
      dragStateRef.current = null;
      setLivePosition(null);
    },
    [livePosition, onPositionChange],
  );

  return (
    <div
      ref={planRef}
      className={cn(
        'relative rounded border border-app-border/50 bg-app-bg',
        editMode && 'ring-1 ring-accent/40 ring-inset',
      )}
      style={{
        minHeight: planHeight,
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent 0 39px, var(--color-app-border, rgba(255,255,255,0.04)) 39px 40px), repeating-linear-gradient(90deg, transparent 0 39px, var(--color-app-border, rgba(255,255,255,0.04)) 39px 40px)',
      }}
    >
      <div className="absolute left-3 top-3 z-10 rounded-sm bg-app-bg px-2 py-0.5 text-[10px] font-bold tracking-[1.5px] uppercase text-app-text-muted">
        {zoneName} · {labels.roomPlanLabel}
      </div>

      {editMode && (
        <div className="absolute right-3 top-3 z-10 rounded-sm bg-accent-muted/40 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-accent">
          {labels.editModeHint}
        </div>
      )}

      {/* Walls */}
      <div
        aria-hidden
        className="absolute bg-app-border"
        style={{ left: 20, top: 36, right: 20, height: 1 }}
      />
      <div
        aria-hidden
        className="absolute bg-app-border"
        style={{ left: 20, bottom: 16, right: 20, height: 1 }}
      />
      <div
        aria-hidden
        className="absolute bg-app-border"
        style={{ left: 20, top: 36, bottom: 16, width: 1 }}
      />
      <div
        aria-hidden
        className="absolute bg-app-border"
        style={{ right: 20, top: 36, bottom: 16, width: 1 }}
      />

      {tables.map((vm, idx) => {
        const saved = positions[vm.table.id];
        const base = saved ?? defaultPosition(idx);
        const live = livePosition && livePosition.tableId === vm.table.id ? livePosition : null;
        const x = live?.x ?? base.x;
        const y = live?.y ?? base.y;
        const isDragging = live !== null;
        return (
          <div
            key={vm.table.id}
            className={cn(
              'absolute transition-[box-shadow] duration-100',
              editMode && 'cursor-move',
              isDragging && 'z-20 shadow-lg',
            )}
            style={{
              left: x,
              top: y,
              width: CARD_W,
              touchAction: editMode ? 'none' : undefined,
            }}
            onPointerDown={(e) => handlePointerDown(e, vm.table.id, base)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <ServiceTableCard
              vm={vm}
              selected={selectedId === vm.table.id}
              dragOver={dragOverId === vm.table.id}
              serverVM={vm.assignment ? serverById.get(vm.assignment.server_id) : undefined}
              labels={labels}
              onSelect={editMode ? () => {} : onSelect}
              onRelease={onRelease}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          </div>
        );
      })}
    </div>
  );
}
