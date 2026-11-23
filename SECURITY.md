# Security policy

Runic SSH holds the keys and passwords to other people's servers, so a flaw here
is worth more than most. Reports are welcome and taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for a vulnerability.**

Use GitHub's private reporting: on the repository, **Security**, then
**Report a vulnerability**
([direct link](https://github.com/marciopaiva/runic-ssh/security/advisories/new)).
It reaches the maintainer privately, keeps the conversation attached to the fix,
and lets a CVE be requested through the advisory if one is warranted.

A report that can be acted on says:

* what is affected and in which version (`Settings`, or the file name of the
  installer you ran);
* what an attacker needs: a hostile server, another account on the same machine,
  a hostile page in the webview, a crafted file;
* the steps to reproduce it, or the code, as small as you can make it;
* what you think the impact is. "A hostile host can make the application do X" is
  more useful than a category.

If you cannot use GitHub, open an issue that says only that you have a security
report and want a private way to send it, with no detail, and the maintainer will
reply there with one.

## What counts

The rules the project holds itself to are in
[`docs/security-model.md`](docs/security-model.md) and are numbered. A report
that breaks one of them is the kind this policy is for:

1. a credential reaching the interface, a log or an error message in plain text;
2. host key verification being skipped, weakened or silently overridden;
3. key material written to disk, or not erased after use;
4. a network call to a host the user did not configure;
5. a way to read or write files the application keeps, or those of another user
   of the machine;
6. a host, as the other end of a connection, being able to make the application
   run something, read something it should not, or exhaust its memory;
7. a flaw in how a build is made or published that lets a file be swapped.

The document also lists what is **accepted by design** and so is not a
vulnerability, for example that the interface can drive everything the
application can, and that a production Space asks for a held button to stop a
slip and is not a security control.

## What to expect

The maintainer is one person. No response time is promised here, because one
that cannot be kept is worse than none. A report that is reproducible and says
what it affects is read first, and the fix, once there is one, goes out in a
release with the advisory published beside it. You will be told when it does.

Credit is given in the advisory if you want it, and not if you do not.

## Supported versions

Only the latest release is supported. Before 1.0 anything may change between
releases, and a fix lands in the next one and not in a backport.

## Checking what you downloaded

The installers are **not code-signed**. Each release carries a `SHA256SUMS` file
covering every file attached, and `docs/installing.md` says how to check it and
what each platform will warn about. If a file does not match, that is a security
report.
