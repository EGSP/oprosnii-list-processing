import type { Application } from "$lib/business/types";
import { Effect } from "effect";
import { uuid } from "zod";
import { DB } from "./db";

export type ApplicationGetProperties = {
    filters?: {
        ids?: string[] | undefined
    },
    options?: {
        simplify?: boolean | undefined
    }
}

export const ApplicationsDB = {
    create: (originalFilename: string): Effect.Effect<Application, Error> => Effect.gen(function* () {
        const application: Application = {
            id: crypto.randomUUID(),
            originalFilename: originalFilename,
            uploadDate: new Date().toISOString(),
        }

        DB.data.applications.push(application);
        DB.write();

        return application;
    }),
    get: (properties: ApplicationGetProperties): Effect.Effect<Application[], Error> => Effect.gen(function* () {
        const applications = DB.data.applications;
        const filteredApplications = applications.filter((application: Application) => {
            if (properties.filters?.ids) {
                return properties.filters.ids.includes(application.id);
            }
            return true;
        });

        if (properties.options?.simplify) {
            return filteredApplications.map((application: Application) => ({
                id: application.id,
                originalFilename: application.originalFilename,
                uploadDate: application.uploadDate
            }));
        }
        return filteredApplications;
    })
}