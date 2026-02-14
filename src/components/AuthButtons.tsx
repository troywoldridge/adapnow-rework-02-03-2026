"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export type AuthButtonsProps = {
  /**
   * Where the account link should go when signed in.
   * Default: "/account"
   */
  accountHref?: string;

  /**
   * Root class hook for CSS.
   * Default: "auth-buttons"
   */
  className?: string;

  /**
   * If true, show the "My Account" link when signed in.
   * Default: true
   */
  showAccountLink?: boolean;

  /**
   * If true, show a Sign Up button when signed out.
   * Default: true
   */
  showSignUp?: boolean;

  /**
   * Clerk modal mode for auth buttons.
   * Default: "modal"
   */
  mode?: "modal" | "redirect";
};

export default function AuthButtons({
  accountHref = "/account",
  className = "auth-buttons",
  showAccountLink = true,
  showSignUp = true,
  mode = "modal",
}: AuthButtonsProps) {
  return (
    <div className={className} aria-label="Authentication" data-auth-buttons>
      <SignedOut>
        <div className="auth-buttons__signedout">
          <SignInButton mode={mode}>
            <button type="button" className="btn btn-secondary btn-sm">
              Sign in
            </button>
          </SignInButton>

          {showSignUp ? (
            <SignUpButton mode={mode}>
              <button type="button" className="btn primary btn-sm">
                Sign up
              </button>
            </SignUpButton>
          ) : null}
        </div>
      </SignedOut>

      <SignedIn>
        <div className="auth-buttons__signedin">
          {showAccountLink ? (
            <Link href={accountHref} className="auth-buttons__accountLink">
              My Account
            </Link>
          ) : null}

          <UserButton
            appearance={{
              elements: {
                avatarBox: "auth-buttons__avatar",
                userButtonPopoverCard: "auth-buttons__popover",
                userPreviewMainIdentifier: "auth-buttons__popoverTitle",
                userPreviewSecondaryIdentifier: "auth-buttons__popoverSub",
              },
            }}
          />
        </div>
      </SignedIn>
    </div>
  );
}
