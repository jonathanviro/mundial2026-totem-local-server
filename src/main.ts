import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Permite que el totem-app (localhost:5173 en dev) llame a la API
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = parseInt(process.env.PORT || '3001');
  await app.listen(port, '127.0.0.1');

  console.log(`\n🖥️  Totem Server corriendo en http://localhost:${port}`);
  console.log(`\n   Endpoints disponibles:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/config`);
  console.log(`   PUT  /api/config`);
  console.log(`   GET  /api/phase/active`);
  console.log(`   GET  /api/phase/teams`);
  console.log(`   GET  /api/registrations/check-factura/:factura`);
  console.log(`   GET  /api/registrations/participant/:cedula`);
  console.log(`   POST /api/registrations`);
  console.log(`   POST /api/sync/trigger`);
  console.log(`   GET  /api/sync/status\n`);
}
bootstrap();
