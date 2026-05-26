CREATE TABLE `file_blobs` (
	`fileKey` varchar(500) NOT NULL,
	`data` longblob NOT NULL,
	`size` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_blobs_fileKey` PRIMARY KEY(`fileKey`)
);
