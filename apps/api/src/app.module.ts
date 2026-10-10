import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import path from 'node:path';
import { AdminController } from './admin.controller';
import { StoreController } from './store.controller';
import { AuthController } from './auth/auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminGuard } from './auth/admin.guard';
import { MediaController } from './media/media.controller';
import { MediaStorageService } from './media/media-storage.service';
import { AdminSchema } from './schemas/admin.schema';
import { AnalyticsEventSchema } from './schemas/analytics-event.schema';
import { AuditLogSchema } from './schemas/audit-log.schema';
import { BranchSchema } from './schemas/branch.schema';
import { CounterSchema } from './schemas/counter.schema';
import { InventorySchema } from './schemas/inventory.schema';
import { OfferSchema } from './schemas/offer.schema';
import { ProductSchema } from './schemas/product.schema';
import { StoreSettingsSchema } from './schemas/store-settings.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('MONGODB_URI') || 'mongodb://127.0.0.1:27017/al_wassouf' }),
    }),
    MongooseModule.forFeature([
      { name: 'Product', schema: ProductSchema },
      { name: 'Branch', schema: BranchSchema },
      { name: 'Inventory', schema: InventorySchema },
      { name: 'Admin', schema: AdminSchema },
      { name: 'StoreSettings', schema: StoreSettingsSchema },
      { name: 'AnalyticsEvent', schema: AnalyticsEventSchema },
      { name: 'AuditLog', schema: AuditLogSchema },
      { name: 'Offer', schema: OfferSchema },
      { name: 'Counter', schema: CounterSchema, collection: 'counters' },
    ]),
  ],
  controllers: [AuthController, AdminController, StoreController, MediaController],
  providers: [AdminAuthService, AdminGuard, MediaStorageService],
})
export class AppModule {}
