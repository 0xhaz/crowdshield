import { createDb, type Db } from "@crowdshield/db";
import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { Config } from "./config.js";

export const DB = Symbol("DB");
export const REDIS = Symbol("REDIS");
export const InjectDb = () => Inject(DB);
export const InjectRedis = () => Inject(REDIS);
export type { Db };

@Injectable()
class Shutdown implements OnApplicationShutdown {
  constructor(
    @Inject("DB_CLIENT") private readonly client: { end(): Promise<void> },
    @InjectRedis() private readonly redis: Redis,
  ) {}
  async onApplicationShutdown() {
    await Promise.allSettled([this.client.end(), this.redis.quit()]);
  }
}

@Global()
@Module({
  providers: [
    { provide: Config, useFactory: () => new Config() },
    {
      provide: "DB_PAIR",
      inject: [Config],
      useFactory: (config: Config) => createDb(config.databaseUrl, { max: 10 }),
    },
    {
      provide: DB,
      inject: ["DB_PAIR"],
      useFactory: (pair: ReturnType<typeof createDb>) => pair.db,
    },
    {
      provide: "DB_CLIENT",
      inject: ["DB_PAIR"],
      useFactory: (pair: ReturnType<typeof createDb>) => pair.client,
    },
    {
      provide: REDIS,
      inject: [Config],
      useFactory: (config: Config) => {
        const redis = new Redis(config.redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: false,
        });
        redis.on("error", (e) => new Logger("redis").warn(e.message));
        return redis;
      },
    },
    Shutdown,
  ],
  exports: [Config, DB, REDIS],
})
export class InfraModule {}
