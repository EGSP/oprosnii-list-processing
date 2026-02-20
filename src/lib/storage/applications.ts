import type { Application } from "$lib/business/types";
import { Effect } from "effect";
import { uuid } from "zod";
import { DB } from "./db";

export function createApplication(originalFilename: string): Effect.Effect<Application, Error> {
    return Effect.gen(function* () {
        const application: Application = {
            id: uuid().toString(),
            originalFilename: originalFilename,
            uploadDate: new Date().toISOString(),
            operations: [],
            productType: null,
            abbreviation: null,
            tags: []
        }

        DB.data.applications.push(application);
        DB.write();

        return application;
    });
}


export type ApplicationGetProperties = {
    filters?: {
        ids?: string[] | undefined
    },
    options?: {
        simplify?: boolean | undefined
    }
}
export function getApplications(properties: ApplicationGetProperties): Effect.Effect<Application[] , Error> {
    return Effect.gen(function* () {
        const applications = DB.data.applications;
        const filteredApplications = applications.filter((application) => {
            if (properties.filters?.ids) {
                return properties.filters.ids.includes(application.id);
            }
            return true;
        });

        if (properties.options?.simplify) {
            return filteredApplications.map((application) => ({
                id: application.id,
                originalFilename: application.originalFilename,
                uploadDate: application.uploadDate
            }));
        }
        return filteredApplications;
    });
}