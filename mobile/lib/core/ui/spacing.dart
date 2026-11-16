import 'package:flutter/material.dart';

abstract final class AppSpacing {
  static const double xs = 4, sm = 8, md = 12, page = 16, lg = 24, xl = 32;
  static const pagePadding = EdgeInsets.symmetric(
    horizontal: page,
    vertical: page,
  );
  static const buttonHeight = 48.0;
}
