import React, { useMemo, useRef, useState } from 'react';
import ElderAvatarMarker from './ElderAvatarMarker';
import {
  formatAxisTick,
  getRoomAxisTicksX,
  getRoomAxisTicksY,
  normalizeIndoorLayout,
} from '../lib/indoorRooms';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isBorderTick = (tick, maxValue) => tick === 0 || Math.abs(tick - maxValue) < 0.001;
const MIN_RECT_SIZE_M = 0.25;
const GRID_STEP_M = 0.05;

const furnitureStyle = {
  bed: { fill: '#FDE68A', stroke: '#D97706', label: 'BED' },
  sofa: { fill: '#BBF7D0', stroke: '#16A34A', label: 'SOFA' },
  toilet: { fill: '#BFDBFE', stroke: '#2563EB', label: 'WC' },
  chair: { fill: '#DDD6FE', stroke: '#7C3AED', label: 'CHAIR' },
  table: { fill: '#FED7AA', stroke: '#EA580C', label: 'TABLE' },
  custom: { fill: '#E2E8F0', stroke: '#475569', label: 'ITEM' },
};

const occupancyStroke = {
  occupied: '#DC2626',
  free: '#16A34A',
  stale: '#F59E0B',
  unknown: '#64748B',
};

const meterToSvgY = (layoutHeight, meterValue) => layoutHeight - meterValue;
const rectSvgY = (layoutHeight, item) => layoutHeight - item.y - item.height;
const snap = (value) => Math.round(value / GRID_STEP_M) * GRID_STEP_M;

const getSvgPoint = (svg, event, layoutHeight) => {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  return {
    x: transformed.x,
    y: meterToSvgY(layoutHeight, transformed.y),
  };
};

const normalizeRect = (start, end, layout) => {
  const x = clamp(snap(Math.min(start.x, end.x)), 0, layout.widthM);
  const y = clamp(snap(Math.min(start.y, end.y)), 0, layout.heightM);
  const width = clamp(snap(Math.abs(end.x - start.x)), 0, layout.widthM - x);
  const height = clamp(snap(Math.abs(end.y - start.y)), 0, layout.heightM - y);
  return { x, y, width, height };
};

const overlapsRect = (a, b) => (
  a.x < b.x + b.width - 0.001
  && a.x + a.width > b.x + 0.001
  && a.y < b.y + b.height - 0.001
  && a.y + a.height > b.y + 0.001
);

const zoneOverlaps = (candidate, zones, currentId) => (
  zones.some((zone) => zone.id !== currentId && overlapsRect(candidate, zone))
);

const resizeRect = (original, corner, point, layout) => {
  let x = original.x;
  let y = original.y;
  let right = original.x + original.width;
  let top = original.y + original.height;

  if (corner.includes('e')) {
    right = clamp(snap(point.x), x + MIN_RECT_SIZE_M, layout.widthM);
  }
  if (corner.includes('w')) {
    x = clamp(snap(point.x), 0, right - MIN_RECT_SIZE_M);
  }
  if (corner.includes('n')) {
    top = clamp(snap(point.y), y + MIN_RECT_SIZE_M, layout.heightM);
  }
  if (corner.includes('s')) {
    y = clamp(snap(point.y), 0, top - MIN_RECT_SIZE_M);
  }

  return {
    x,
    y,
    width: snap(right - x),
    height: snap(top - y),
  };
};

const resizeHandlesFor = (item, layoutHeight) => ([
  { corner: 'nw', x: item.x, y: rectSvgY(layoutHeight, item), cursor: 'nwse-resize' },
  { corner: 'ne', x: item.x + item.width, y: rectSvgY(layoutHeight, item), cursor: 'nesw-resize' },
  { corner: 'sw', x: item.x, y: rectSvgY(layoutHeight, item) + item.height, cursor: 'nesw-resize' },
  { corner: 'se', x: item.x + item.width, y: rectSvgY(layoutHeight, item) + item.height, cursor: 'nwse-resize' },
]);

const IndoorMapCanvas = ({
  layout,
  position,
  editable = false,
  drawMode = null,
  selectedItem,
  onSelectItem,
  onMoveItem,
  onCreateZone,
  className = 'h-[420px] w-full',
}) => {
  const svgRef = useRef(null);
  const normalizedLayout = useMemo(() => normalizeIndoorLayout(layout), [layout]);
  const [dragState, setDragState] = useState(null);
  const [drawState, setDrawState] = useState(null);

  const ticksX = useMemo(() => getRoomAxisTicksX(normalizedLayout), [normalizedLayout]);
  const ticksY = useMemo(() => getRoomAxisTicksY(normalizedLayout), [normalizedLayout]);
  const pointerEnabled = editable ? 'auto' : 'none';

  const startDrag = (event, type, item) => {
    if (!editable || !svgRef.current) {
      return;
    }
    event.stopPropagation();
    svgRef.current.setPointerCapture?.(event.pointerId);
    const point = getSvgPoint(svgRef.current, event, normalizedLayout.heightM);
    setDragState({
      mode: 'move',
      type,
      id: item.id,
      offsetX: point.x - item.x,
      offsetY: point.y - item.y,
      width: item.width || 0,
      height: item.height || 0,
    });
    onSelectItem?.(type, item.id);
  };

  const startResize = (event, type, item, corner) => {
    if (!editable || !svgRef.current) {
      return;
    }
    event.stopPropagation();
    svgRef.current.setPointerCapture?.(event.pointerId);
    const point = getSvgPoint(svgRef.current, event, normalizedLayout.heightM);
    setDragState({
      mode: 'resize',
      type,
      id: item.id,
      corner,
      startPoint: point,
      original: {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      },
    });
    onSelectItem?.(type, item.id);
  };

  const handlePointerDown = (event) => {
    if (!editable || drawMode !== 'zone' || !svgRef.current) {
      return;
    }
    const point = getSvgPoint(svgRef.current, event, normalizedLayout.heightM);
    svgRef.current.setPointerCapture?.(event.pointerId);
    setDrawState({
      start: point,
      current: point,
    });
  };

  const handlePointerMove = (event) => {
    if (!svgRef.current) {
      return;
    }
    const point = getSvgPoint(svgRef.current, event, normalizedLayout.heightM);

    if (dragState) {
      if (dragState.type === 'anchor') {
        onMoveItem?.(dragState.type, dragState.id, {
          x: clamp(snap(point.x - dragState.offsetX), 0, normalizedLayout.widthM),
          y: clamp(snap(point.y - dragState.offsetY), 0, normalizedLayout.heightM),
        });
        return;
      }

      if (dragState.mode === 'resize') {
        const candidate = resizeRect(dragState.original, dragState.corner, point, normalizedLayout);
        if (dragState.type !== 'zone' || !zoneOverlaps(candidate, normalizedLayout.zones, dragState.id)) {
          onMoveItem?.(dragState.type, dragState.id, candidate);
        }
        return;
      }

      const candidate = {
        x: clamp(snap(point.x - dragState.offsetX), 0, normalizedLayout.widthM - dragState.width),
        y: clamp(snap(point.y - dragState.offsetY), 0, normalizedLayout.heightM - dragState.height),
        width: dragState.width,
        height: dragState.height,
      };
      if (dragState.type !== 'zone' || !zoneOverlaps(candidate, normalizedLayout.zones, dragState.id)) {
        onMoveItem?.(dragState.type, dragState.id, {
          x: candidate.x,
          y: candidate.y,
        });
      }
      return;
    }

    if (drawState) {
      setDrawState((current) => ({ ...current, current: point }));
    }
  };

  const handlePointerUp = () => {
    if (drawState) {
      const rect = normalizeRect(drawState.start, drawState.current, normalizedLayout);
      if (rect.width >= MIN_RECT_SIZE_M && rect.height >= MIN_RECT_SIZE_M && !zoneOverlaps(rect, normalizedLayout.zones, null)) {
        onCreateZone?.(rect);
      }
    }
    setDragState(null);
    setDrawState(null);
  };

  const drawRect = drawState ? normalizeRect(drawState.start, drawState.current, normalizedLayout) : null;
  const drawRectOverlaps = drawRect ? zoneOverlaps(drawRect, normalizedLayout.zones, null) : false;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${normalizedLayout.widthM} ${normalizedLayout.heightM}`}
      className={`${className} rounded-xl bg-slate-50`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <rect
        x="0"
        y="0"
        width={normalizedLayout.widthM}
        height={normalizedLayout.heightM}
        fill="#ffffff"
        stroke="#334155"
        strokeWidth="0.05"
      />

      {ticksX.map((tick) => {
        if (isBorderTick(tick, normalizedLayout.widthM)) {
          return null;
        }
        return (
          <line
            key={`grid-x-${tick}`}
            x1={tick}
            y1="0"
            x2={tick}
            y2={normalizedLayout.heightM}
            stroke="#e2e8f0"
            strokeWidth="0.02"
            strokeDasharray="0.08 0.08"
          />
        );
      })}

      {ticksY.map((tick) => {
        if (isBorderTick(tick, normalizedLayout.heightM)) {
          return null;
        }
        const yValue = meterToSvgY(normalizedLayout.heightM, tick);
        return (
          <line
            key={`grid-y-${tick}`}
            x1="0"
            y1={yValue}
            x2={normalizedLayout.widthM}
            y2={yValue}
            stroke="#e2e8f0"
            strokeWidth="0.02"
            strokeDasharray="0.08 0.08"
          />
        );
      })}

      {normalizedLayout.zones.map((zone) => {
        const active = position?.roomId === zone.id;
        const selected = selectedItem?.type === 'zone' && selectedItem?.id === zone.id;
        return (
          <g
            key={zone.id}
            onPointerDown={(event) => startDrag(event, 'zone', zone)}
            pointerEvents={pointerEnabled}
            className={editable ? 'cursor-move' : undefined}
          >
            <rect
              x={zone.x}
              y={rectSvgY(normalizedLayout.heightM, zone)}
              width={zone.width}
              height={zone.height}
              fill={active ? zone.color : `${zone.color}26`}
              stroke={selected ? '#0F172A' : zone.color}
              strokeWidth={selected ? '0.09' : active ? '0.07' : '0.04'}
              rx="0.04"
            />
            <text
              x={zone.x + zone.width / 2}
              y={rectSvgY(normalizedLayout.heightM, zone) + zone.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="0.18"
              fill={active ? '#0f172a' : '#334155'}
              fontWeight={active ? '700' : '500'}
              pointerEvents="none"
            >
              {zone.label}
            </text>
          </g>
        );
      })}

      {editable && selectedItem?.type === 'zone' ? normalizedLayout.zones
        .filter((zone) => zone.id === selectedItem.id)
        .map((zone) => (
          <g key={`zone-handles-${zone.id}`} pointerEvents="auto">
            {resizeHandlesFor(zone, normalizedLayout.heightM).map((handle) => (
              <rect
                key={handle.corner}
                x={handle.x - 0.09}
                y={handle.y - 0.09}
                width="0.18"
                height="0.18"
                rx="0.03"
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="0.035"
                style={{ cursor: handle.cursor }}
                onPointerDown={(event) => startResize(event, 'zone', zone, handle.corner)}
              />
            ))}
          </g>
        )) : null}

      {normalizedLayout.furniture.map((item) => {
        const style = furnitureStyle[item.type] || furnitureStyle.custom;
        const selected = selectedItem?.type === 'furniture' && selectedItem?.id === item.id;
        const statusStroke = occupancyStroke[item.occupancyState] || occupancyStroke.unknown;
        return (
          <g
            key={item.id}
            onPointerDown={(event) => startDrag(event, 'furniture', item)}
            pointerEvents={pointerEnabled}
            className={editable ? 'cursor-move' : undefined}
          >
            <rect
              x={item.x}
              y={rectSvgY(normalizedLayout.heightM, item)}
              width={item.width}
              height={item.height}
              fill={style.fill}
              stroke={selected ? '#0F172A' : statusStroke}
              strokeWidth={selected ? '0.09' : '0.06'}
              rx="0.05"
              opacity="0.92"
            />
            <line
              x1={item.x + 0.08}
              y1={rectSvgY(normalizedLayout.heightM, item) + 0.08}
              x2={item.x + item.width - 0.08}
              y2={rectSvgY(normalizedLayout.heightM, item) + item.height - 0.08}
              stroke={style.stroke}
              strokeWidth="0.025"
              opacity="0.55"
            />
            <text
              x={item.x + item.width / 2}
              y={rectSvgY(normalizedLayout.heightM, item) + item.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="0.14"
              fill="#0f172a"
              fontWeight="700"
              pointerEvents="none"
            >
              {style.label}
            </text>
          </g>
        );
      })}

      {editable && selectedItem?.type === 'furniture' ? normalizedLayout.furniture
        .filter((item) => item.id === selectedItem.id)
        .map((item) => (
          <g key={`furniture-handles-${item.id}`} pointerEvents="auto">
            {resizeHandlesFor(item, normalizedLayout.heightM).map((handle) => (
              <rect
                key={handle.corner}
                x={handle.x - 0.09}
                y={handle.y - 0.09}
                width="0.18"
                height="0.18"
                rx="0.03"
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="0.035"
                style={{ cursor: handle.cursor }}
                onPointerDown={(event) => startResize(event, 'furniture', item, handle.corner)}
              />
            ))}
          </g>
        )) : null}

      {normalizedLayout.anchors.map((anchor) => {
        const selected = selectedItem?.type === 'anchor' && selectedItem?.id === anchor.id;
        const x = anchor.x;
        const y = meterToSvgY(normalizedLayout.heightM, anchor.y);
        return (
          <g
            key={anchor.id}
            onPointerDown={(event) => startDrag(event, 'anchor', anchor)}
            pointerEvents={pointerEnabled}
            className={editable ? 'cursor-move' : undefined}
          >
            <circle
              cx={x}
              cy={y}
              r="0.16"
              fill={anchor.enabled ? '#0F766E' : '#94A3B8'}
              stroke={selected ? '#0F172A' : '#ffffff'}
              strokeWidth={selected ? '0.08' : '0.04'}
            />
            <circle cx={x} cy={y} r="0.06" fill="#ffffff" opacity="0.95" />
            <text
              x={x + 0.22}
              y={y - 0.12}
              fontSize="0.13"
              fill="#0f172a"
              fontWeight="700"
              pointerEvents="none"
            >
              {anchor.id}
            </text>
          </g>
        );
      })}

      <g pointerEvents="none">
        <line x1="0" y1={normalizedLayout.heightM} x2={normalizedLayout.widthM} y2={normalizedLayout.heightM} stroke="#1f2937" strokeWidth="0.03" />
        <line x1="0" y1="0" x2="0" y2={normalizedLayout.heightM} stroke="#1f2937" strokeWidth="0.03" />

        {ticksX.map((tick) => (
          <g key={`axis-x-${tick}`}>
            <line x1={tick} y1={normalizedLayout.heightM} x2={tick} y2={normalizedLayout.heightM - 0.08} stroke="#1f2937" strokeWidth="0.03" />
            <text
              x={tick}
              y={normalizedLayout.heightM - 0.13}
              textAnchor={tick === 0 ? 'start' : (isBorderTick(tick, normalizedLayout.widthM) ? 'end' : 'middle')}
              fontSize="0.12"
              fill="#334155"
            >
              {formatAxisTick(tick)}
            </text>
          </g>
        ))}

        {ticksY.map((tick) => {
          const yValue = meterToSvgY(normalizedLayout.heightM, tick);
          return (
            <g key={`axis-y-${tick}`}>
              <line x1="0" y1={yValue} x2="0.08" y2={yValue} stroke="#1f2937" strokeWidth="0.03" />
              <text x="0.12" y={yValue + 0.04} textAnchor="start" fontSize="0.12" fill="#334155">
                {formatAxisTick(tick)}
              </text>
            </g>
          );
        })}

        <text x={normalizedLayout.widthM - 0.08} y={normalizedLayout.heightM - 0.28} textAnchor="end" fontSize="0.12" fill="#0f172a" fontWeight="600">
          X (m)
        </text>
        <text x="0.1" y="0.24" textAnchor="start" fontSize="0.12" fill="#0f172a" fontWeight="600">
          Y (m)
        </text>
      </g>

      {drawRect ? (
        <rect
          x={drawRect.x}
          y={normalizedLayout.heightM - drawRect.y - drawRect.height}
          width={drawRect.width}
          height={drawRect.height}
          fill={drawRectOverlaps ? '#F8717133' : '#38BDF833'}
          stroke={drawRectOverlaps ? '#DC2626' : '#0284C7'}
          strokeWidth="0.05"
          strokeDasharray="0.12 0.08"
          pointerEvents="none"
        />
      ) : null}

      <ElderAvatarMarker
        x={position?.x ?? null}
        y={position?.y != null ? meterToSvgY(normalizedLayout.heightM, position.y) : null}
        scale={1.05}
      />
    </svg>
  );
};

export default IndoorMapCanvas;
