CREATE TABLE organizers (token TEXT PRIMARY KEY NOT NULL);
--> statement-breakpoint
CREATE TABLE draws (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, links TEXT NOT NULL, owner TEXT NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX draws_owner ON draws(owner);
--> statement-breakpoint
CREATE TABLE results (token TEXT PRIMARY KEY NOT NULL, giver TEXT NOT NULL, recipient TEXT NOT NULL, title TEXT NOT NULL);
