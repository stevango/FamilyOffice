CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`legalCaseId` int,
	`type` varchar(50) NOT NULL,
	`title` varchar(500) NOT NULL,
	`message` text,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `alerts_householdId_idx` ON `alerts` (`householdId`);