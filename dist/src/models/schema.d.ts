export declare const user: any;
export declare const eventData: any;
export declare const userEvents: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "user_events";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "user_events";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "user_events";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        eventId: import("drizzle-orm/pg-core").PgColumn<{
            name: "event_id";
            tableName: "user_events";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const userRelations: import("drizzle-orm").Relations<string, {
    events: import("drizzle-orm").Many<any>;
}>;
export declare const eventDataRelations: import("drizzle-orm").Relations<string, {
    user: import("drizzle-orm").One<any, false>;
}>;
//# sourceMappingURL=schema.d.ts.map