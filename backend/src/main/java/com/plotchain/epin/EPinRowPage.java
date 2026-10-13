package com.plotchain.epin;

import java.util.List;

public record EPinRowPage<T>(List<T> rows, int page, int size, long totalElements) {}
