import { z } from 'zod'

// ─── Primitives ────────────────────────────────────────────────────────────

export const Point2D = z.tuple([z.number(), z.number()])

// ─── CAD Commands ──────────────────────────────────────────────────────────

export const DrawWallCommand = z.object({
  action: z.literal('draw_wall'),
  from: Point2D,
  to: Point2D,
  thickness: z.number().min(5).max(100).default(20), // cm
  layer: z.string().default('walls'),
})

export const DrawRoomCommand = z.object({
  action: z.literal('draw_room'),
  origin: Point2D,
  width: z.number().positive(),  // cm
  height: z.number().positive(), // cm
  label: z.string().optional(),
  wallThickness: z.number().default(20),
})

export const PlaceDoorCommand = z.object({
  action: z.literal('place_door'),
  position: Point2D,           // center of door
  width: z.number().default(90), // cm
  rotation: z.number().default(0), // degrees
  swingDirection: z.enum(['left', 'right', 'double', 'sliding']).default('left'),
})

export const PlaceWindowCommand = z.object({
  action: z.literal('place_window'),
  position: Point2D,
  width: z.number().default(120), // cm
  rotation: z.number().default(0),
})

export const AddAnnotationCommand = z.object({
  action: z.literal('add_annotation'),
  position: Point2D,
  text: z.string(),
})

export const AddDimensionCommand = z.object({
  action: z.literal('add_dimension'),
  from: Point2D,
  to: Point2D,
  offset: z.number().default(30), // cm away from the line
})

export const DeleteSelectionCommand = z.object({
  action: z.literal('delete_selection'),
})

export const SelectAllCommand = z.object({
  action: z.literal('select_all'),
})

export const DeleteElementCommand = z.object({
  action: z.literal('delete_element'),
  label: z.string(),
})

export const ClearCanvasCommand = z.object({
  action: z.literal('clear_canvas'),
})

// ─── Union ─────────────────────────────────────────────────────────────────

export const CADCommand = z.discriminatedUnion('action', [
  DrawWallCommand,
  DrawRoomCommand,
  PlaceDoorCommand,
  PlaceWindowCommand,
  AddAnnotationCommand,
  AddDimensionCommand,
  DeleteSelectionCommand,
  SelectAllCommand,
  DeleteElementCommand,
  ClearCanvasCommand,
])

export type CADCommand = z.infer<typeof CADCommand>
export type DrawWallCommand = z.infer<typeof DrawWallCommand>
export type DrawRoomCommand = z.infer<typeof DrawRoomCommand>
export type PlaceDoorCommand = z.infer<typeof PlaceDoorCommand>
export type PlaceWindowCommand = z.infer<typeof PlaceWindowCommand>
export type AddAnnotationCommand = z.infer<typeof AddAnnotationCommand>
export type AddDimensionCommand = z.infer<typeof AddDimensionCommand>
