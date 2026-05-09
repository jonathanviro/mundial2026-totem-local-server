import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';

import { PrismaService } from './prisma.service';
import { ConfigService } from './config/config.service';
import { SyncService } from './sync/sync.service';
import { RegistrationsService } from './registrations/registrations.service';
import {
  HealthController,
  TotemConfigController,
  SyncController,
  RegistrationsController,
  PhasesController,
} from './controllers';

// El totem-app compilado se sirve como archivos estáticos
// En desarrollo: apunta a ../totem-app/dist
// Se puede sobreescribir con la variable TOTEM_APP_DIST
const STATIC_DIR = process.env.TOTEM_APP_DIST
  || path.join(__dirname, '..', '..', 'totem-app', 'dist');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: STATIC_DIR,
      exclude: ['/api/(.*)'],
      serveStaticOptions: { index: 'index.html' },
    }),
  ],
  controllers: [
    HealthController,
    TotemConfigController,
    SyncController,
    RegistrationsController,
    PhasesController,
  ],
  providers: [
    PrismaService,
    ConfigService,
    SyncService,
    RegistrationsService,
  ],
})
export class AppModule {}
