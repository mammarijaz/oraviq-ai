import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<any>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    name: 'Test User',
    role: 'ADMIN',
    organizationId: 'org-1',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOrg = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org-123',
  };

  beforeEach(async () => {
    const txMock = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      organization: {
        create: jest.fn(),
      },
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(txMock)),
      _txMock: txMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
  });

  describe('register()', () => {
    it('creates org + user and returns tokens', async () => {
      const txMock = prisma._txMock;
      txMock.user.findFirst.mockResolvedValue(null);
      txMock.organization.create.mockResolvedValue(mockOrg);
      txMock.user.create.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        organizationName: 'Test Org',
      });

      expect(txMock.organization.create).toHaveBeenCalled();
      expect(txMock.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('hashes password with bcrypt before storing', async () => {
      const txMock = prisma._txMock;
      txMock.user.findFirst.mockResolvedValue(null);
      txMock.organization.create.mockResolvedValue(mockOrg);
      // Capture the data passed to user.create to verify password was hashed
      txMock.user.create.mockImplementation(async (args: any) => {
        const { passwordHash } = args.data;
        // Verify that the stored value is a bcrypt hash, not plain text
        const isValid = await bcrypt.compare('plain-text-password', passwordHash);
        expect(isValid).toBe(true);
        expect(passwordHash).not.toBe('plain-text-password');
        return mockUser;
      });

      await service.register({
        email: 'test@example.com',
        password: 'plain-text-password',
        name: 'Test User',
        organizationName: 'Test Org',
      });

      expect(txMock.user.create).toHaveBeenCalled();
    });

    it('throws ConflictException if email already registered', async () => {
      const txMock = prisma._txMock;
      txMock.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          organizationName: 'Test Org',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login()', () => {
    it('returns tokens for valid credentials', async () => {
      const hashedPw = await bcrypt.hash('correct-password', 10);
      const userWithHash = { ...mockUser, passwordHash: hashedPw };
      prisma.user.findFirst.mockResolvedValue(userWithHash);

      const result = await service.login({
        email: 'test@example.com',
        password: 'correct-password',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hashedPw = await bcrypt.hash('correct-password', 10);
      const userWithHash = { ...mockUser, passwordHash: hashedPw };
      prisma.user.findFirst.mockResolvedValue(userWithHash);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for non-existent email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser()', () => {
    it('returns user (without passwordHash) for valid credentials', async () => {
      const hashedPw = await bcrypt.hash('correct-password', 10);
      const userWithHash = { ...mockUser, passwordHash: hashedPw };
      prisma.user.findFirst.mockResolvedValue(userWithHash);

      const result = await service.validateUser('test@example.com', 'correct-password');

      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.id).toBe('user-1');
    });

    it('returns null for invalid credentials', async () => {
      const hashedPw = await bcrypt.hash('correct-password', 10);
      const userWithHash = { ...mockUser, passwordHash: hashedPw };
      prisma.user.findFirst.mockResolvedValue(userWithHash);

      const result = await service.validateUser('test@example.com', 'wrong-password');

      expect(result).toBeNull();
    });

    it('returns null for non-existent user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.validateUser('nobody@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('generateTokens()', () => {
    it('returns access + refresh tokens', () => {
      jwtService.sign
        .mockReturnValueOnce('access-token-value')
        .mockReturnValueOnce('refresh-token-value');

      const result = service.generateTokens({
        id: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'ADMIN',
      });

      expect(result.accessToken).toBe('access-token-value');
      expect(result.refreshToken).toBe('refresh-token-value');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('signs the refresh token with 7d expiry', () => {
      service.generateTokens({
        id: 'user-1',
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'ADMIN',
      });

      // Second call should include expiresIn: '7d'
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        { expiresIn: '7d' },
      );
    });
  });

  describe('refreshToken()', () => {
    it('returns new tokens for existing user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refreshToken('user-1');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws NotFoundException for unknown userId', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
