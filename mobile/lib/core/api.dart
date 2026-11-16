import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'school.dart';
import 'store.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  bool get offline => status == 0;
  @override
  String toString() => message;
}

/// HTTP client for the Campus One API. Adds the access token and campus, renews the 15-minute
/// access token with the refresh token once when a request gets 401, and retries once on 503.
enum Renewal { success, rejected, temporaryFailure }

class Api {
  Api(this._store, {Dio? dio}) {
    if (kReleaseMode && !validReleaseApiUrl(School.apiUrl)) {
      throw StateError('Release builds require an HTTPS API_URL');
    }
    _dio =
        dio ??
        Dio(
          BaseOptions(
            baseUrl: School.apiUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 30),
            headers: {'Accept': 'application/json'},
          ),
        );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (accessToken != null && options.extra['noAuth'] != true) {
            options.headers['Authorization'] = 'Bearer $accessToken';
          }
          if (campusId != null) options.headers['x-campus-id'] = campusId;
          handler.next(options);
        },
        onError: (error, handler) async {
          final options = error.requestOptions;
          final status = error.response?.statusCode;
          if (status == 401 &&
              options.extra['noAuth'] != true &&
              options.extra['retried'] != true) {
            final renewal = await _renew();
            if (renewal == Renewal.success) {
              options.extra['retried'] = true;
              options.headers['Authorization'] = 'Bearer $accessToken';
              try {
                return handler.resolve(await _dio.fetch(options));
              } on DioException catch (e) {
                return handler.next(e);
              }
            }
            if (renewal == Renewal.rejected) {
              await onSessionEnded?.call();
            } else {
              return handler.next(
                DioException(
                  requestOptions: options,
                  type: DioExceptionType.connectionError,
                  error: 'Session refresh temporarily unavailable',
                ),
              );
            }
          } else if (status == 401 &&
              options.extra['retried'] == true &&
              options.extra['noAuth'] != true) {
            await onSessionEnded?.call();
          }
          if (status == 503 && options.extra['retry503'] != true) {
            final wait =
                int.tryParse(
                  error.response?.headers.value('retry-after') ?? '',
                ) ??
                3;
            await Future<void>.delayed(Duration(seconds: wait.clamp(1, 5)));
            options.extra['retry503'] = true;
            try {
              return handler.resolve(await _dio.fetch(options));
            } on DioException catch (e) {
              return handler.next(e);
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  final Store _store;
  late final Dio _dio;
  String? accessToken;
  String? campusId;

  /// Called when the refresh token is rejected; the app returns to sign-in.
  Future<void> Function()? onSessionEnded;
  Completer<Renewal>? _renewing;

  /// Exchanges the refresh token for a new pair; concurrent callers share one request.
  Future<Renewal> _renew() {
    if (_renewing != null) return _renewing!.future;
    final completer = _renewing = Completer<Renewal>();
    () async {
      try {
        final token = await _store.refreshToken;
        if (token == null) return completer.complete(Renewal.rejected);
        final r = await _dio.post<Map<String, dynamic>>(
          '/auth/refresh',
          data: {'refreshToken': token},
          options: Options(extra: {'noAuth': true}),
        );
        await useTokens(r.data!);
        completer.complete(Renewal.success);
      } on DioException catch (error) {
        completer.complete(
          error.response?.statusCode == 401
              ? Renewal.rejected
              : Renewal.temporaryFailure,
        );
      } catch (_) {
        completer.complete(Renewal.temporaryFailure);
      } finally {
        _renewing = null;
      }
    }();
    return completer.future;
  }

  Future<Renewal> renew() => _renew();

  Future<void> useTokens(Map<String, dynamic> tokens) async {
    accessToken = tokens['accessToken'] as String?;
    await _store.setAccessToken(accessToken);
    await _store.setRefreshToken(tokens['refreshToken'] as String?);
  }

  ApiException _wrap(Object error) {
    if (error is DioException) {
      final response = error.response;
      if (response == null) return ApiException(0, 'No internet connection');
      final data = response.data;
      final message = data is Map && data['message'] != null
          ? '${data['message']}'
          : 'Request failed';
      return ApiException(response.statusCode ?? 0, message);
    }
    return ApiException(-1, '$error');
  }

  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    try {
      return (await _dio.get<dynamic>(
        path,
        queryParameters: query,
        options: Options(extra: {'noAuth': !auth}),
      )).data;
    } catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> post(String path, [Object? body, bool auth = true]) async {
    try {
      return (await _dio.post<dynamic>(
        path,
        data: body ?? <String, dynamic>{},
        options: Options(extra: {'noAuth': !auth}),
      )).data;
    } catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> delete(String path) async {
    try {
      return (await _dio.delete<dynamic>(path)).data;
    } catch (e) {
      throw _wrap(e);
    }
  }

  /// Downloads a PDF (receipt, report card) into app storage and opens it in the phone's viewer.
  Future<void> openPdf(String path, String fileName) async {
    try {
      final dir = await getTemporaryDirectory();
      final file = File(
        '${dir.path}/${fileName.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')}',
      );
      await _dio.download(path, file.path);
      await OpenFilex.open(file.path, type: 'application/pdf');
    } catch (e) {
      throw _wrap(e);
    }
  }
}
