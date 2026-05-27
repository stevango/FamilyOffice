CREATE TABLE `share_access_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`documentId` int,
	`fileKey` varchar(500) NOT NULL,
	`ip` varchar(64),
	`userAgent` varchar(255),
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `share_access_household_idx` ON `share_access_logs` (`householdId`);