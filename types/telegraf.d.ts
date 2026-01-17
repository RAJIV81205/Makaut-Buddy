import "telegraf";

export interface BotSession {
  branch?: string;
  semester?: string;
  subject?: string;

  pyq_branch?: string;
  pyq_sem?: string;

  uploadType?: "note" | "pyq";
  uploadBranch?: string;
  uploadSemester?: string;
  uploadSubject?: string;
  uploadYear?: string;
}

declare module "telegraf" {
  interface Context {
    session: BotSession;
  }
}
