import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: { get: () => 'test' },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('returns app info payload', () => {
    expect(controller.getInfo()).toMatchObject({
      name: 'StockVirtue backend',
      status: 'ok',
    });
  });
});
