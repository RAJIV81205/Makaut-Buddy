import "telegraf";

declare module "telegraf" {
  interface Context {
    session: {
      branch?: string;
      semester?: string;
      subject?: string;

      pyq_branch?: string;
      pyq_sem?: string;
    };
  }
}
