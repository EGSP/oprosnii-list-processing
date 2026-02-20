import { JSONFilePreset } from "lowdb/node";
import { config } from "../config.js";
import { ApplicationSchema, type Application } from ".";
import { z } from "zod";

const DBSchema = z.object({
	applications: z.array(ApplicationSchema)
})
type DBType = z.infer<typeof DBSchema>;

const DEFAULT_DATA: DBType = {
	applications: []
}
export const DB = await JSONFilePreset(config.dbPath, DEFAULT_DATA);
DB.read();