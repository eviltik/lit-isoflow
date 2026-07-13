/**
 * Model schemas ported from Isoflow's src/schemas/*.
 * The parsed model is the single source of truth consumed by <lit-isoflow>;
 * its JSON shape is interchangeable with Isoflow/FossFLOW exports.
 */
import { z } from 'zod';

export const coordsSchema = z.object({
  x: z.number(),
  y: z.number()
});

const id = z.string();

const constrainedStrings = {
  name: z.string().max(100),
  description: z.string().max(1000)
};

export const colorSchema = z.object({
  id,
  value: z.string().max(7)
});

export const colorsSchema = z.array(colorSchema);

export const iconSchema = z.object({
  id,
  name: constrainedStrings.name,
  url: z.string(),
  collection: constrainedStrings.name.optional(),
  isIsometric: z.boolean().optional()
});

export const iconsSchema = z.array(iconSchema);

export const modelItemSchema = z.object({
  id,
  name: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  icon: id.optional()
});

export const modelItemsSchema = z.array(modelItemSchema);

export const connectorStyleOptions = ['SOLID', 'DOTTED', 'DASHED'];

export const anchorSchema = z.object({
  id,
  ref: z
    .object({
      item: id,
      anchor: id,
      tile: coordsSchema
    })
    .partial()
});

export const connectorSchema = z.object({
  id,
  description: constrainedStrings.description.optional(),
  color: id.optional(),
  width: z.number().optional(),
  style: z.enum(connectorStyleOptions).optional(),
  anchors: z.array(anchorSchema)
});

export const rectangleSchema = z.object({
  id,
  color: id.optional(),
  from: coordsSchema,
  to: coordsSchema
});

export const textBoxSchema = z.object({
  id,
  tile: coordsSchema,
  content: constrainedStrings.name,
  fontSize: z.number().optional(),
  orientation: z.union([z.literal('X'), z.literal('Y')]).optional()
});

export const viewItemSchema = z.object({
  id,
  tile: coordsSchema,
  labelHeight: z.number().optional()
});

export const viewSchema = z.object({
  id,
  lastUpdated: z.string().datetime().optional(),
  name: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  items: z.array(viewItemSchema),
  rectangles: z.array(rectangleSchema).optional(),
  connectors: z.array(connectorSchema).optional(),
  textBoxes: z.array(textBoxSchema).optional()
});

export const viewsSchema = z.array(viewSchema);

export const modelSchema = z.object({
  version: z.string().max(10).optional(),
  title: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  items: modelItemsSchema,
  views: viewsSchema,
  icons: iconsSchema,
  colors: colorsSchema
});
