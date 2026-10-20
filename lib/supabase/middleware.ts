import {
  createServerClient,
} from "@supabase/ssr";

import type {
  NextRequest,
} from "next/server";

import {
  NextResponse,
} from "next/server";

export async function updateSession(
  request: NextRequest,
) {
  let response =
    NextResponse.next({
      request,
    });

  const url =
    (
      process.env
        .NEXT_PUBLIC_SUPABASE_URL ??
      ""
    ).trim();

  const anonKey =
    (
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      ""
    ).trim();

  if (
    !url ||
    !anonKey
  ) {
    return response;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
        "http:" &&
      parsed.protocol !==
        "https:"
    ) {
      return response;
    }
  } catch {
    return response;
  }

  const supabase =
    createServerClient(
      url,
      anonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet,
          ) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value,
                );
              },
            );

            response =
              NextResponse.next({
                request,
              });

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options,
                );
              },
            );
          },
        },
      },
    );

  // getClaims() verifies the JWT locally (no Auth round trip when the project
  // uses asymmetric signing keys) and still refreshes an expired session via
  // getSession(), so refreshed cookies are written through setAll above.
  // Falls back to the network getUser() when claims cannot be verified.
  let user: { id: string } | null = null;

  try {
    const { data, error } =
      await supabase.auth.getClaims();
    const sub = (
      data?.claims as
        | { sub?: unknown }
        | undefined
    )?.sub;
    if (
      !error &&
      typeof sub === "string" &&
      sub.length > 0
    ) {
      user = { id: sub };
    }
  } catch {
    user = null;
  }

  if (!user) {
    try {
      const {
        data: { user: fetched },
      } = await supabase.auth.getUser();
      user = fetched ? { id: fetched.id } : null;
    } catch {
      user = null;
    }
  }

  const pathname =
    request.nextUrl.pathname;

  const isAuthRoute =
    pathname.startsWith(
      "/login",
    ) ||
    pathname.startsWith(
      "/auth",
    );

  const isProtectedRoute =
    pathname.startsWith(
      "/dashboard",
    ) ||
    pathname.startsWith(
      "/zooplens",
    ) ||
    pathname.startsWith(
      "/brand-vault",
    ) ||
    pathname.startsWith(
      "/records",
    );

  if (
    !user &&
    isProtectedRoute
  ) {
    const redirectUrl =
      request.nextUrl.clone();

    redirectUrl.pathname =
      "/login";

    redirectUrl.searchParams.set(
      "next",
      pathname,
    );

    return NextResponse.redirect(
      redirectUrl,
    );
  }

  if (
    user &&
    isAuthRoute
  ) {
    const redirectUrl =
      request.nextUrl.clone();

    redirectUrl.pathname =
      "/today";

    redirectUrl.search = "";

    return NextResponse.redirect(
      redirectUrl,
    );
  }

  return response;
}