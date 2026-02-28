import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import config from "../config/environment";

interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

interface AuthResult {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  token: string;
}

/**
 * Handles user login and token management.
 * Account creation is handled by the admin settings panel.
 */
export class AuthService {
  /**
   * Authenticate a user with username/email and password.
   */
  async login(identifier: string, password: string): Promise<AuthResult> {
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    }).select("+password");

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    const token = this.generateToken(user);

    return {
      user: {
        id: String(user._id),
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  /**
   * Verify a JWT token and return the payload.
   */
  verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch {
      throw new Error("Invalid or expired token");
    }
  }

  /**
   * Get user profile by ID.
   */
  async getUserById(userId: string): Promise<IUser | null> {
    return User.findById(userId);
  }

  /**
   * Generate a JWT for any user (used by setup controller).
   */
  generateTokenForUser(user: IUser): string {
    return this.generateToken(user);
  }

  private generateToken(user: IUser): string {
    const payload: TokenPayload = {
      userId: String(user._id),
      username: user.username,
      role: user.role,
    };

    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);
  }
}

export default new AuthService();
