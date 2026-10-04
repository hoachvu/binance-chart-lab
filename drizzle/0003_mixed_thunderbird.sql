CREATE TABLE `account_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `local_accounts` ADD `recovery_email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `local_accounts_recovery_email_unique` ON `local_accounts` (`recovery_email`);