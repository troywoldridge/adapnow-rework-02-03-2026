"use client";

import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  UserButton,
  SignInButton,
  SignUpButton,
} from "@clerk/nextjs";

export type AuthButtonsProps = {
  /**
   * Where the "My Account" link should go.
   * Default: "/account"
   */
  accountHref?: string;

  /**
   * Layout style hook for CSS.
   * Default: "auth-buttons"
   */
  className?: string;

  /**
   * If true, show the "My Account" link when signed in.
   * Default: true
   */
  showAccountLink?: boolean;
};

export default function AuthButtons({
  accountHref = "/account",
  className = "auth-buttons",
  showAccountLink = true,
}: AuthButtonsProps) {
  return (
    <div className={className} aria-label="Authentication">
      <SignedOut>
        <div className="auth-buttons__signedout">
          <SignInButton mode="modal">
            <button type="button" className="btn btn-secondary btn-sm">
              Sign in
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button type="button" className="btn primary btn-sm">
              Sign up
            </button>
          </SignUpButton>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="auth-buttons__signedin">
          {showAccountLink ? (
            <Link href={accountHref} className="auth-buttons__accountLink">
              My Account
            </Link>
          ) : null}

          <div className="auth-buttons__user">
            <UserButton />
          </div>
        </div>
      </SignedIn>
    </div>
  );
}
